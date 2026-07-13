import { slugify } from "./common.mjs";

export const normalizeProductionEngine = (value) => (value === "remotion" ? "remotion" : "hyperframes");

export const normalizeBrandProfile = (value) => (value === "buda" ? "buda" : "project");

export const handoffKind = (decision) => {
  if (decision?.workflow_step === "ai_video_production_requested") return "ai_video_production";
  if (decision?.workflow_step === "delivery_requested") return "post_production_delivery";
  return "";
};

export const handoffBaseName = (item) => `${String(item.ref || item.id || "video").replace(/\s+/g, "-").toLowerCase()}-${slugify(item.filename || item.title || item.id || "video")}`;

const scriptText = (item) => {
  const value = String(item.body || item.summary || "").trim();
  if (!value) return "No script text was captured. Read the source script asset before authoring.";
  return value.length > 8000 ? `${value.slice(0, 8000).trim()}\n\n...` : value;
};

const sourceAssets = (item) =>
  (item.source_assets || [])
    .map((asset) => `- ${asset.type}: ${asset.name} (${asset.path})`)
    .join("\n") || "- None";

const selectedChannels = (item, decision) => {
  const selected = Array.isArray(decision.outputs) && decision.outputs.length ? decision.outputs : (item.outputs || []).map((output) => output.channel);
  return selected.map((channel) => `- ${channel}`).join("\n") || "- No channel selected";
};

const coverCopy = (item, decision) => `- Chinese title: ${decision.cover_zh_title || decision.cover_title || item.cover_copy?.locales?.zh?.title || item.cover_copy?.title || ""}
- Chinese subtitle: ${decision.cover_zh_subtitle || decision.cover_subtitle || item.cover_copy?.locales?.zh?.subtitle || item.cover_copy?.subtitle || ""}
- English title: ${decision.cover_en_title || item.cover_copy?.locales?.en?.title || ""}
- English subtitle: ${decision.cover_en_subtitle || item.cover_copy?.locales?.en?.subtitle || ""}`;

const driveFolderContract = `- Script/: approved script/storyboard and source manifest
- Remotion/ or HyperFrames/: AI master video, voice audio, and SRT/VTT subtitles
- Covers/: final 16:9 and 9:16 cover exports
- Raw/: human screen recording after AI video approval
- Post/: final horizontal post-production master
- Shorts/: final vertical Shorts exports
- Distribution/: editable platform copy and published-link records`;

export const renderAiVideoProductionHandoff = ({ item, decision, production = {} }) => {
  const engine = normalizeProductionEngine(decision.production_engine || production.default_engine);
  const brandProfile = normalizeBrandProfile(decision.brand_profile || production.default_brand_profile);
  const workspace = production.video_workspace_repository || "vikadata/videos";

  return `# AI Video Production Handoff: ${item.title}

Ref: ${item.ref}
ID: ${item.display_id || item.id}
Filename: ${item.filename || ""}
Engine: ${engine}
Brand profile: ${brandProfile}
Video workspace: ${workspace}
Delivery skill: ${production.delivery_skill || "buda-video-delivery"} covers mode

## Goal

Create the AI review package before any human screen recording. The package must contain a rendered horizontal AI video with picture, voice, subtitles, and final cover exports. Cover production happens in this AI production stage, not in post-production.

## Source Script

${scriptText(item)}

## Source Evidence

${sourceAssets(item)}

## Required Outputs

${driveFolderContract}

The AI review gate requires Script/, Remotion/ or HyperFrames/, and Covers/. Do not request or assign a human recording until those files are present and a reviewer approves the AI package.

## Production Steps

1. Create or update the project in ${workspace}; record the source repository commit and relative source paths, never an absolute local path.
2. Use $${engine === "remotion" ? "remotion" : "hyperframes"} to produce the 16:9 AI master from the approved storyboard. Include voice and subtitles; do not use a digital-human video.
3. Invoke $buda-video-delivery in covers mode with brand profile ${brandProfile}. Produce the selected cover languages, required 16:9 exports, and the matching 9:16 Shorts cover variant when Shorts or vertical delivery is selected.
4. Attach the selected cover to the AI video as the first 3 seconds when the composition supports it, then render and verify the master, audio, subtitle, and cover files locally. This handoff does not upload assets to Google Drive yet.
5. The controlled Drive-export phase places the verified package into the folder contract above, then Buda Video Studio moves the project to 待确认 AI 视频.

## Cover Copy

${coverCopy(item, decision)}

## Requested Channels

${selectedChannels(item, decision)}
`;
};

export const renderPostProductionDeliveryHandoff = ({ item, decision, production = {} }) => {
  const brandProfile = normalizeBrandProfile(decision.brand_profile || production.default_brand_profile);

  return `# Post-production Delivery Handoff: ${item.title}

Ref: ${item.ref}
ID: ${item.display_id || item.id}
Brand profile: ${brandProfile}
Delivery skill: ${production.delivery_skill || "buda-video-delivery"} publish mode

## Goal

The AI package was approved and the human screen recording is the final production input. Put the recording over the AI video where required, create the final horizontal master, then package the selected channel exports. Distribution confirmation only starts after subtitles, SRT files, hard-caption outputs, Shorts cover insertion, and platform files are verified.

## Inputs To Verify

- Approved AI master, voice, subtitles, and covers from Remotion/ and Covers/
- Human screen recording from Raw/
- Approved script for subtitle checks

## Required Outputs

${driveFolderContract}

## Delivery Steps

1. Finish the horizontal post-production master in Post/ and export the clean YouTube master plus sidecar SRT/TXT files when available.
2. Invoke $buda-video-delivery in publish mode. It owns SRT extraction/regeneration, SRT review against the approved script, single-line SRT normalization, channel packaging, hard subtitles, and Shorts generation.
3. Burn the approved subtitles into the 视频号 output. Generate Shorts from the hard-caption 视频号 output and prepend the matching 9:16 cover from Covers/.
4. Use a native 9:16 composition when the project has one. Use letterbox only as the fallback that preserves a horizontal recording unchanged.
5. Keep platform copy editable in Distribution/; record the published platform and public link only after a human publishes.
6. This handoff does not publish to social platforms or upload assets to Google Drive.

## Requested Channels

${selectedChannels(item, decision)}

## Cover Copy

${coverCopy(item, decision)}
`;
};
