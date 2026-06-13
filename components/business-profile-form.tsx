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
        <Field label="Company name" error={form.formState.errors.companyName?.message}>
          <Input {...form.register("companyName")} />
        </Field>
        <Field label="Website" error={form.formState.errors.website?.message}>
          <Input {...form.register("website")} />
        </Field>
        <Field label="Business archetype" error={form.formState.errors.archetype?.message}>
          <select className="h-9 rounded-md border bg-black/20 px-3 text-sm" {...form.register("archetype")}>
            <option value="software">Software</option>
            <option value="local_services">Local services</option>
            <option value="agency_services">Agency / services</option>
          </select>
        </Field>
        <Field label="Sender name" error={form.formState.errors.senderName?.message}>
          <Input {...form.register("senderName")} />
        </Field>
        <Field label="Sender email" error={form.formState.errors.senderEmail?.message}>
          <Input
            value={form.watch("senderEmail") ?? ""}
            onChange={(event) =>
              form.setValue("senderEmail", event.target.value.trim() || null, {
                shouldDirty: true,
              })
            }
          />
        </Field>
        <Field label="Offer name" error={form.formState.errors.offerName?.message}>
          <Input {...form.register("offerName")} />
        </Field>
        <Field label="Offer URL" error={form.formState.errors.offerUrl?.message}>
          <Input {...form.register("offerUrl")} />
        </Field>
        <Field label="Signature" error={form.formState.errors.signature?.message}>
          <Input {...form.register("signature")} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Business description" error={form.formState.errors.description?.message}>
            <Textarea rows={4} {...form.register("description")} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Offer description" error={form.formState.errors.offerDescription?.message}>
            <Textarea rows={4} {...form.register("offerDescription")} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field
            label="Target market summary"
            error={form.formState.errors.targetMarketSummary?.message}
          >
            <Textarea rows={3} {...form.register("targetMarketSummary")} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Button type="submit">
            <Save className="h-4 w-4" /> Save business profile
          </Button>
        </div>
      </form>
      {message ? <p className="mt-4 rounded-md border bg-black/20 px-3 py-2 text-sm">{message}</p> : null}
    </Card>
  );
}
