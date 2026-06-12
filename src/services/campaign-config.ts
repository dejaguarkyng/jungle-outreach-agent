import fs from "node:fs";
import path from "node:path";
import {
  campaignConfigurationSchema,
  type CampaignConfiguration,
} from "@/packages/shared/src";

const CAMPAIGN_DIRECTORY = path.resolve(process.cwd(), "config/campaigns");

export function listCampaignConfigurations(): CampaignConfiguration[] {
  if (!fs.existsSync(CAMPAIGN_DIRECTORY)) return [];
  return fs
    .readdirSync(CAMPAIGN_DIRECTORY)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => readCampaign(path.join(CAMPAIGN_DIRECTORY, name)));
}

export function loadCampaignConfiguration(campaignId = "jungle-grid"): CampaignConfiguration {
  const campaign = listCampaignConfigurations().find((item) => item.campaignId === campaignId);
  if (!campaign) throw new Error(`Campaign configuration not found: ${campaignId}.`);
  return campaign;
}

function readCampaign(filename: string): CampaignConfiguration {
  return campaignConfigurationSchema.parse(JSON.parse(fs.readFileSync(filename, "utf8")));
}
