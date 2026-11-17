"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/primitives/menu";
import type { FaqGroup } from "@/lib/content/faq";
import FaqList from "./FaqList";

/** FAQ groups as tabs (arrow keys move between them), each an accordion. */
export default function FaqTabs({ groups }: { groups: FaqGroup[] }) {
  return (
    <Tabs defaultValue={groups[0]?.id} className="w-full">
      <TabsList aria-label="Question topics" className="flex-wrap gap-x-7 gap-y-0">
        {groups.map((g) => (
          <TabsTrigger key={g.id} value={g.id}>
            {g.title}
            <span className="ml-2 text-muted-foreground tabular-nums">{g.items.length}</span>
          </TabsTrigger>
        ))}
      </TabsList>
      {groups.map((g) => (
        <TabsContent key={g.id} value={g.id}>
          <FaqList items={g.items} defaultOpen={0} />
        </TabsContent>
      ))}
    </Tabs>
  );
}
