import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const PROFILE_DIR = ".md-reader";
const PROFILE_FILE = "profiles.json";

function createDefaultProfile(profileId = "default") {
  return {
    id: profileId,
    appearance: {
      theme: "system",
      fontSize: 16,
      pageWidth: "narrow",
      lineHeight: 1.6,
    },
    layout: {
      sidebarWidth: 280,
      outlineWidth: 320,
      sidebarCollapsed: false,
      outlineCollapsed: false,
    },
    navigation: {
      expandedFileNodes: [],
      expandedFileNodesInitialized: false,
      expandedHeadingNodes: {},
    },
  };
}

function profilesFilePath(projectRoot) {
  return path.join(projectRoot, PROFILE_DIR, PROFILE_FILE);
}

function normalizeProfile(profileId, profile = {}) {
  const fallback = createDefaultProfile(profileId);
  return {
    id: profile.id ?? profileId,
    appearance: {
      ...fallback.appearance,
      ...(profile.appearance ?? {}),
    },
    layout: {
      ...fallback.layout,
      ...(profile.layout ?? {}),
    },
    navigation: {
      ...fallback.navigation,
      ...(profile.navigation ?? {}),
      expandedFileNodes: profile.navigation?.expandedFileNodes ?? fallback.navigation.expandedFileNodes,
      expandedFileNodesInitialized:
        profile.navigation?.expandedFileNodesInitialized ??
        fallback.navigation.expandedFileNodesInitialized,
      expandedHeadingNodes:
        profile.navigation?.expandedHeadingNodes ?? fallback.navigation.expandedHeadingNodes,
    },
  };
}

function sortProfileIds(profileIds) {
  return [...new Set(profileIds)].sort((left, right) => {
    if (left === "default") return -1;
    if (right === "default") return 1;
    if (left === "Lans") return right === "default" ? 1 : -1;
    if (right === "Lans") return left === "default" ? -1 : 1;
    return left.localeCompare(right);
  });
}

function normalizeProfilesDocument(payload = {}) {
  const profiles = {
    default: normalizeProfile("default", payload.profiles?.default),
    Lans: normalizeProfile("Lans", payload.profiles?.Lans),
  };

  for (const [profileId, profile] of Object.entries(payload.profiles ?? {})) {
    profiles[profileId] = normalizeProfile(profileId, profile);
  }

  return {
    version: 1,
    profiles,
  };
}

async function loadProfilesDocument(projectRoot) {
  const filePath = profilesFilePath(projectRoot);
  await mkdir(path.dirname(filePath), { recursive: true });

  try {
    const raw = await readFile(filePath, "utf8");
    const payload = normalizeProfilesDocument(JSON.parse(raw));
    await writeFile(filePath, JSON.stringify(payload, null, 2));
    return payload;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      const payload = normalizeProfilesDocument();
      await writeFile(filePath, JSON.stringify(payload, null, 2));
      return payload;
    }

    throw error;
  }
}

export async function listProjectProfiles(projectRoot) {
  const payload = await loadProfilesDocument(projectRoot);
  return sortProfileIds(Object.keys(payload.profiles));
}

export async function getProjectProfile(projectRoot, profileId) {
  const payload = await loadProfilesDocument(projectRoot);
  return normalizeProfile(profileId, payload.profiles[profileId]);
}

export async function saveProjectProfile(projectRoot, profile) {
  const payload = await loadProfilesDocument(projectRoot);
  const normalizedProfile = normalizeProfile(profile?.id ?? "default", profile);
  payload.profiles[normalizedProfile.id] = normalizedProfile;
  await writeFile(profilesFilePath(projectRoot), JSON.stringify(normalizeProfilesDocument(payload), null, 2));
  return normalizedProfile;
}
