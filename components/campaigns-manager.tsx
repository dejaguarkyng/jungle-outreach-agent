"use client";

import { useMemo, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import type { CampaignConfiguration, CampaignRecord } from "@/packages/shared/src";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function CampaignsManager({
  campaigns: initialCampaigns,
  templates,
}: {
  campaigns: CampaignRecord[];
  templates: CampaignConfiguration[];
}) {
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [message, setMessage] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState("");
  const [name, setName] = useState("");
  const [archetype, setArchetype] = useState<CampaignRecord["archetype"]>("software");
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>(
    initialCampaigns[0]?.campaignId ?? templates[0]?.campaignId ?? "",
  );
  const [editorValue, setEditorValue] = useState(
    JSON.stringify(initialCampaigns[0]?.campaign ?? templates[0] ?? {}, null, 2),
  );

  const options = useMemo(
    () =>
      campaigns.length > 0
        ? campaigns
        : templates.map((template) => ({
            id: `template:${template.campaignId}`,
            campaignId: template.campaignId,
            name: template.name,
            active: template.active,
            archetype: "software" as const,
            source: "template" as const,
            campaign: template,
            createdAt: new Date(0).toISOString(),
            updatedAt: new Date(0).toISOString(),
          })),
    [campaigns, templates],
  );

  function loadIntoEditor(campaign: CampaignConfiguration) {
    setSelectedCampaignId(campaign.campaignId);
    setEditorValue(JSON.stringify(campaign, null, 2));
  }

  async function createPreset() {
    const response = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "preset",
        campaignId,
        name,
        archetype,
      }),
    });
    const payload = await response.json();
    setMessage(response.ok ? "Campaign created." : payload.error ?? "Campaign could not be created.");
    if (!response.ok) return;
    setCampaigns([payload.campaign, ...campaigns.filter((item) => item.campaignId !== payload.campaign.campaignId)]);
    loadIntoEditor(payload.campaign.campaign);
    setSelectedCampaignId(payload.campaign.campaignId);
  }

  async function saveEditor() {
    let parsed: CampaignConfiguration;
    try {
      parsed = JSON.parse(editorValue) as CampaignConfiguration;
    } catch {
      setMessage("Campaign JSON must be valid.");
      return;
    }
    const response = await fetch(`/api/campaigns/${encodeURIComponent(parsed.campaignId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed),
    });
    const payload = await response.json();
    setMessage(response.ok ? "Campaign saved." : payload.error ?? "Campaign could not be saved.");
    if (!response.ok) return;
    setCampaigns([payload.campaign, ...campaigns.filter((item) => item.campaignId !== payload.campaign.campaignId)]);
    setSelectedCampaignId(payload.campaign.campaignId);
  }

  async function removeCampaign(id: string) {
    const response = await fetch(`/api/campaigns/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) return;
    const next = campaigns.filter((item) => item.campaignId !== id);
    setCampaigns(next);
    const fallback = next[0]?.campaign ?? templates[0] ?? {};
    setEditorValue(JSON.stringify(fallback, null, 2));
    setSelectedCampaignId(next[0]?.campaignId ?? templates[0]?.campaignId ?? "");
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
      <div className="space-y-5">
        <Card className="p-5">
          <h2 className="font-semibold">Create campaign</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Start from an archetype preset, then refine the full campaign contract in the editor.
          </p>
          <div className="mt-4 grid gap-4">
            <Field label="Campaign ID">
              <Input value={campaignId} onChange={(event) => setCampaignId(event.target.value)} placeholder="acme-software-outbound" />
            </Field>
            <Field label="Campaign name">
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Acme software outbound" />
            </Field>
            <Field label="Archetype">
              <select className="h-9 rounded-md border bg-black/20 px-3 text-sm" value={archetype} onChange={(event) => setArchetype(event.target.value as CampaignRecord["archetype"])}>
                <option value="software">Software</option>
                <option value="local_services">Local services</option>
                <option value="agency_services">Agency / services</option>
              </select>
            </Field>
            <Button onClick={createPreset} disabled={!campaignId.trim() || !name.trim()}>
              <Plus className="h-4 w-4" /> Create preset campaign
            </Button>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold">Saved campaigns</h2>
          <div className="mt-4 space-y-3">
            {options.map((item) => (
              <div key={item.id} className="rounded-md border bg-black/20 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{item.name}</p>
                      <Badge tone={item.active ? "green" : "amber"}>{item.active ? "Active" : "Inactive"}</Badge>
                      <Badge>{item.source}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{item.campaignId}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.campaign.offer.name}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={() => loadIntoEditor(item.campaign)}>
                      Edit
                    </Button>
                    {item.source === "saved" ? (
                      <Button variant="ghost" size="icon" onClick={() => removeCampaign(item.campaignId)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold">Campaign editor</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Edit the full persisted campaign contract. This is the source of truth used for runs.
            </p>
          </div>
          <Badge>{selectedCampaignId || "unsaved"}</Badge>
        </div>
        <div className="mt-4">
          <Field label="Campaign JSON">
            <Textarea rows={28} value={editorValue} onChange={(event) => setEditorValue(event.target.value)} className="font-mono text-xs" />
          </Field>
        </div>
        <div className="mt-4 flex gap-2">
          <Button onClick={saveEditor}>
            <Save className="h-4 w-4" /> Save campaign
          </Button>
        </div>
        {message ? <p className="mt-4 rounded-md border bg-black/20 px-3 py-2 text-sm">{message}</p> : null}
      </Card>
    </div>
  );
}
