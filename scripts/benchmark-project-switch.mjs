import os from 'node:os';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const baseUrl = process.env.BENCHMARK_BASE_URL;
const projects = (process.env.BENCHMARK_PROJECTS ?? '').split(',').map((value) => value.trim()).filter(Boolean);
if (!baseUrl || projects.length < 2) throw new Error('Set BENCHMARK_BASE_URL and BENCHMARK_PROJECTS with at least two visible project names.');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const timings = [];
try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  for (let index = 0; index < 33; index += 1) {
    await page.evaluate(() => {
      performance.clearMarks('project-switch-requested');
      performance.clearMarks('project-tree-interactive');
    });
    const selector = page.getByRole('combobox', { name: '项目切换' });
    const currentProject = (await selector.innerText()).trim();
    const targetProject = projects.find((name) => name !== currentProject);
    if (!targetProject) throw new Error('Benchmark projects must include a project other than the current selection.');
    await selector.click();
    await page.getByRole('option', { name: targetProject, exact: true }).click();
    await page.waitForFunction(() => performance.getEntriesByName('project-tree-interactive').length > 0);
    const duration = await page.evaluate(() => {
      const start = performance.getEntriesByName('project-switch-requested').at(-1);
      const end = performance.getEntriesByName('project-tree-interactive').at(-1);
      return end.startTime - start.startTime;
    });
    if (index >= 3) timings.push(duration);
  }
} finally { await browser.close(); }

const ordered = [...timings].sort((a, b) => a - b);
const valueAt = (p) => ordered[Math.ceil(p * ordered.length) - 1];
const report = { schemaVersion: 1, commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), platform: process.platform, cpu: os.cpus()[0]?.model ?? 'unknown', memoryBytes: os.totalmem(), node: process.version, browser: 'chromium', samples: timings.length, p50: valueAt(0.5), p95: valueAt(0.95), max: ordered.at(-1), measurementsMs: timings };
const output = path.join(process.cwd(), 'artifacts', 'benchmarks', 'project-switch', `${new Date().toISOString().replaceAll(':', '-')}.json`);
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2));
console.log(output);
