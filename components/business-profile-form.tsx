"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Save } from "lucide-react";
import type { z } from "zod";
import {
  businessProfileInputSchema,
  type BusinessProfile,
} from "@/packages/shared/src";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Values = z.infer<typeof businessProfileInputSchema>;

const archetypeSuggestions = {
  software: {
    businessDescriptions: [
      "We build software products for teams that need reliable operational workflows and better customer outcomes.",
      "We provide software tools that help businesses automate repetitive work, improve visibility, and scale delivery.",
    ],
    offerDescriptions: [
      "A software product that helps teams improve reliability, execution, and day-to-day operating efficiency.",
      "A workflow and operations platform for teams that need better automation, visibility, and execution control.",
    ],
    targetMarketSummaries: [
      "B2B software teams with growing operational complexity, repeatable workflows, and customer-facing delivery needs.",
      "Small and mid-sized software companies that need better execution, automation, and operational reliability.",
    ],
  },
  local_services: {
    businessDescriptions: [
      "We help local service businesses convert more leads, reduce missed opportunities, and improve appointment flow.",
      "We provide tools for service businesses that need better booking, follow-up, and customer communication workflows.",
    ],
    offerDescriptions: [
      "A service-business workflow product for lead capture, booking, follow-up, and operational reliability.",
      "A customer-conversion and booking workflow system for service businesses handling calls, forms, and appointments.",
    ],
    targetMarketSummaries: [
      "Local service businesses that depend on inbound leads, appointment scheduling, and timely customer follow-up.",
      "Independent service operators that need better booking flow, faster responses, and fewer missed leads.",
    ],
  },
  agency_services: {
    businessDescriptions: [
      "We help client-service businesses standardize delivery, improve internal workflows, and reduce manual coordination work.",
      "We provide operational systems for agencies and service firms managing repeatable client work and team execution.",
    ],
    offerDescriptions: [
      "A delivery and workflow system for agencies and service businesses that need better coordination and repeatability.",
      "An operations product for service firms managing client workflows, handoffs, approvals, and execution.",
    ],
    targetMarketSummaries: [
      "Agencies and service firms with repeatable client delivery processes, internal handoffs, and growth-related coordination pain.",
      "Consulting and client-service teams that need stronger process discipline, execution visibility, and repeatable delivery.",
    ],
  },
} as const;

function friendlyError(error?: string): string | undefined {
  if (!error) return undefined;
  if (error.includes("at least 1 character")) return "Required.";
  return error;
}

export function BusinessProfileForm({
  initialProfile,
}: {
  initialProfile: BusinessProfile | null;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(businessProfileInputSchema),
    defaultValues: initialProfile ?? {
      companyName: "",
      website: "https://",
      description: "",
      archetype: "software",
      offerName: "",
      offerDescription: "",
      offerUrl: "https://",
      senderName: "",
      senderEmail: null,
      signature: "",
      targetMarketSummary: "",
    },
  });

  async function save(values: Values) {
    const response = await fetch("/api/business-profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const payload = await response.json();
    setMessage(response.ok ? "Business profile saved." : payload.error ?? "Business profile could not be saved.");
  }

  const archetype = form.watch("archetype");
  const suggestions = archetypeSuggestions[archetype];

  function applySuggestion(
    field: "description" | "offerDescription" | "targetMarketSummary",
    value: string,
  ) {
    form.setValue(field, value, { shouldDirty: true, shouldValidate: true });
  }

  function autofillCoreFields() {
    const companyName = form.getValues("companyName").trim();
    const website = form.getValues("website").trim();
    const senderName = form.getValues("senderName").trim();
    if (companyName && !form.getValues("offerName").trim()) {
      form.setValue("offerName", companyName, { shouldDirty: true, shouldValidate: true });
    }
    if (website && !form.getValues("offerUrl").trim()) {
      form.setValue("offerUrl", website, { shouldDirty: true, shouldValidate: true });
    }
    if (senderName && !form.getValues("signature").trim()) {
      form.setValue("signature", senderName, { shouldDirty: true, shouldValidate: true });
    }
    if (!form.getValues("description").trim()) {
      applySuggestion("description", suggestions.businessDescriptions[0]);
    }
    if (!form.getValues("offerDescription").trim()) {
      applySuggestion("offerDescription", suggestions.offerDescriptions[0]);
    }
    if (!form.getValues("targetMarketSummary").trim()) {
      applySuggestion("targetMarketSummary", suggestions.targetMarketSummaries[0]);
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold">Business profile</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            This profile seeds campaign defaults, setup status, and operator-facing business context.
          </p>
        </div>
      </div>
      <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={form.handleSubmit(save)}>
        <Field label="Company name" error={friendlyError(form.formState.errors.companyName?.message)}>
          <Input {...form.register("companyName")} />
        </Field>
        <Field label="Website" error={friendlyError(form.formState.errors.website?.message)}>
          <Input {...form.register("website")} />
        </Field>
        <Field label="Business archetype" error={friendlyError(form.formState.errors.archetype?.message)}>
          <select className="h-9 rounded-md border bg-black/20 px-3 text-sm" {...form.register("archetype")}>
            <option value="software">Software</option>
            <option value="local_services">Local services</option>
            <option value="agency_services">Agency / services</option>
          </select>
        </Field>
        <Field label="Sender name" error={friendlyError(form.formState.errors.senderName?.message)}>
          <Input {...form.register("senderName")} />
        </Field>
        <Field label="Sender email" error={friendlyError(form.formState.errors.senderEmail?.message)}>
          <Input
            value={form.watch("senderEmail") ?? ""}
            onChange={(event) =>
              form.setValue("senderEmail", event.target.value.trim() || null, {
                shouldDirty: true,
              })
            }
          />
        </Field>
        <Field label="Offer name" error={friendlyError(form.formState.errors.offerName?.message)}>
          <Input {...form.register("offerName")} placeholder="Usually your product or service name" />
        </Field>
        <Field label="Offer URL" error={friendlyError(form.formState.errors.offerUrl?.message)}>
          <Input {...form.register("offerUrl")} placeholder="https://your-product-site.example" />
        </Field>
        <Field label="Signature" error={friendlyError(form.formState.errors.signature?.message)}>
          <Input {...form.register("signature")} placeholder="Usually the sender name" />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Business description" error={friendlyError(form.formState.errors.description?.message)}>
            <Textarea rows={4} {...form.register("description")} />
          </Field>
          <div className="mt-2 flex flex-wrap gap-2">
            {suggestions.businessDescriptions.map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => applySuggestion("description", value)}
              >
                Use suggestion
              </Button>
            ))}
          </div>
        </div>
        <div className="sm:col-span-2">
          <Field label="Offer description" error={friendlyError(form.formState.errors.offerDescription?.message)}>
            <Textarea rows={4} {...form.register("offerDescription")} />
          </Field>
          <div className="mt-2 flex flex-wrap gap-2">
            {suggestions.offerDescriptions.map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => applySuggestion("offerDescription", value)}
              >
                Use suggestion
              </Button>
            ))}
          </div>
        </div>
        <div className="sm:col-span-2">
          <Field
            label="Target market summary"
            error={friendlyError(form.formState.errors.targetMarketSummary?.message)}
          >
            <Textarea rows={3} {...form.register("targetMarketSummary")} />
          </Field>
          <div className="mt-2 flex flex-wrap gap-2">
            {suggestions.targetMarketSummaries.map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => applySuggestion("targetMarketSummary", value)}
              >
                Use suggestion
              </Button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button type="button" variant="secondary" onClick={autofillCoreFields}>
            Autofill common fields
          </Button>
          <Button type="submit">
            <Save className="h-4 w-4" /> Save business profile
          </Button>
        </div>
      </form>
      {message ? <p className="mt-4 rounded-md border bg-black/20 px-3 py-2 text-sm">{message}</p> : null}
    </Card>
  );
}
