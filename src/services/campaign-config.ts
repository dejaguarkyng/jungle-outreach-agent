import fs from "node:fs";
import path from "node:path";
import {
  type BusinessArchetype,
  campaignConfigurationSchema,
  type CampaignConfiguration,
  type CampaignRecord,
  type BusinessProfile,
  type OutreachSettings,
} from "@/packages/shared/src";
import { OutreachRepository } from "@/src/db/repository";

const CAMPAIGN_DIRECTORY = path.resolve(process.cwd(), "config/campaigns");

export function listCampaignConfigurations(): CampaignConfiguration[] {
  if (!fs.existsSync(CAMPAIGN_DIRECTORY)) return [];
  return fs
    .readdirSync(CAMPAIGN_DIRECTORY)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => readCampaign(path.join(CAMPAIGN_DIRECTORY, name)));
}

export function listTemplateCampaignConfigurations(): CampaignConfiguration[] {
  return listCampaignConfigurations();
}

export function listAvailableCampaigns(
  repository = new OutreachRepository(),
): CampaignRecord[] {
  const saved = repository.listCampaigns();
  if (saved.length > 0) return saved;
  return listTemplateCampaignConfigurations().map((campaign) => ({
    id: `template:${campaign.campaignId}`,
    campaignId: campaign.campaignId,
    name: campaign.name,
    active: campaign.active,
    archetype:
      campaign.channels.includes("business_phone") || campaign.channels.includes("booking_link")
        ? "local_services"
        : campaign.channels.includes("linkedin_profile") || campaign.channels.includes("linkedin_company")
          ? "agency_services"
          : "software",
    source: "template" as const,
    campaign,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  }));
}

export function loadCampaignConfiguration(
  campaignId = "jungle-grid",
  repository = new OutreachRepository(),
): CampaignConfiguration {
  const saved = repository.getCampaign(campaignId);
  if (saved) return saved.campaign;
  const campaign = listTemplateCampaignConfigurations().find(
    (item) => item.campaignId === campaignId,
  );
  if (!campaign) throw new Error(`Campaign configuration not found: ${campaignId}.`);
  return campaign;
}

export function applySettingsToCampaign(
  campaign: CampaignConfiguration,
  settings: OutreachSettings,
): CampaignConfiguration {
  return campaignConfigurationSchema.parse({
    ...campaign,
    discovery: {
      ...(campaign.discovery ?? {}),
      maximumConcurrentSources: settings.maximumConcurrentSources,
      maximumConcurrentEnrichments: settings.maximumConcurrentEnrichments,
      queryBudgetPerSource: settings.sourceQueryBudget,
      candidateBudgetPerSource: settings.sourceCandidateBudget,
      deadlineSeconds: settings.discoveryDeadlineSeconds,
      preliminaryTargetMultiplier: settings.preliminaryTargetMultiplier,
      minimumDistinctSources: settings.minimumDistinctSources,
      cacheTtlSeconds: settings.sourceCacheTtlSeconds,
    },
    sourceDiversity: {
      ...(campaign.sourceDiversity ?? {}),
      minimumDistinctSources: settings.minimumDistinctSources,
      maximumEvidencePerSource: settings.maximumEvidencePerSource,
      maximumProspectsPerEntity: settings.maximumProspectsPerEntity,
    },
    proofOfValue: {
      ...(campaign.proofOfValue ?? {}),
      minimumScore: settings.proofMinimumScore,
    },
    delivery: {
      ...(campaign.delivery ?? {}),
      browserAutomationEnabled: settings.browserAutomationEnabled,
      allowedBrowserDomains: settings.browserAllowedDomains,
      screenshotRetentionDays: settings.screenshotRetentionDays,
    },
  });
}

export function templateForArchetype(
  archetype: BusinessArchetype,
): CampaignConfiguration {
  const templateId =
    archetype === "local_services"
      ? "local-services-booking"
      : archetype === "agency_services"
        ? "generic-saas-observability"
        : "jungle-grid";
  const template = listTemplateCampaignConfigurations().find(
    (item) => item.campaignId === templateId,
  );
  if (!template) {
    throw new Error(`Template campaign not found: ${templateId}.`);
  }
  return template;
}

export function buildCampaignFromProfile(
  profile: BusinessProfile | null,
  input: {
    campaignId: string;
    name: string;
    archetype: BusinessArchetype;
  },
): CampaignConfiguration {
  const template = structuredClone(templateForArchetype(input.archetype));
  const companySlug = (profile?.companyName ?? "company")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return campaignConfigurationSchema.parse({
    ...template,
    workspaceId: "default",
    campaignId: input.campaignId || `${companySlug}-${input.archetype}`,
    name: input.name,
    offer: {
      ...template.offer,
      name: profile?.offerName ?? template.offer.name,
      description: profile?.offerDescription ?? template.offer.description,
      url: profile?.offerUrl ?? template.offer.url,
      senderName: profile?.senderName ?? template.offer.senderName,
      signature: profile?.signature ?? template.offer.signature,
    },
    businessInformation: profile
      ? {
          description: profile.description,
          website: profile.website,
        }
      : template.businessInformation,
  });
}

function readCampaign(filename: string): CampaignConfiguration {
  return campaignConfigurationSchema.parse(JSON.parse(fs.readFileSync(filename, "utf8")));
}
