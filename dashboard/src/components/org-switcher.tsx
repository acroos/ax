"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface Org {
  slug: string;
  name: string;
  is_personal: boolean;
}

function OrgGlyph({ name }: { name: string }) {
  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded bg-accent text-[10px] font-bold text-accent-foreground">
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

export function OrgSwitcher({
  orgs,
  currentSlug,
}: {
  orgs: Org[];
  currentSlug?: string;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const current = orgs.find((o) => o.slug === currentSlug) ?? orgs[0];
  if (!current) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          role="combobox"
          aria-expanded={open}
          aria-label="Select organization"
          className="h-9 w-full justify-between gap-2 px-2 font-medium"
        >
          <span className="flex min-w-0 items-center gap-2">
            <OrgGlyph name={current.name} />
            <span className="truncate text-sm">{current.name}</span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command>
          <CommandInput placeholder="Search organizations..." />
          <CommandList>
            <CommandEmpty>No organization found.</CommandEmpty>
            <CommandGroup>
              {orgs.map((org) => {
                const isCurrent = org.slug === current.slug;
                return (
                  <CommandItem
                    key={org.slug}
                    value={`${org.name} ${org.slug}`}
                    onSelect={() => {
                      setOpen(false);
                      if (!isCurrent) router.push(`/${org.slug}`);
                    }}
                  >
                    <OrgGlyph name={org.name} />
                    <span className="truncate">{org.name}</span>
                    {org.is_personal && (
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        Personal
                      </span>
                    )}
                    <Check
                      className={cn(
                        "ml-auto size-4",
                        isCurrent ? "opacity-100" : "opacity-0",
                      )}
                    />
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
