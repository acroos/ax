import { ClientTooltip } from "@/components/client-tooltip";
import {
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function HeaderWithTip({ label, tip }: { label: string; tip: string }) {
  return (
    <ClientTooltip content={tip}>
      <span className="cursor-default">{label}</span>
    </ClientTooltip>
  );
}

export function PRTableHeader() {
  return (
    <TableHeader>
      <TableRow>
        <TableHead>PR</TableHead>
        <TableHead>Title</TableHead>
        <TableHead className="text-center">Size</TableHead>
        <TableHead className="text-center">State</TableHead>
        <TableHead className="text-center">
          <HeaderWithTip label="Post-Open" tip="Commits after PR opened" />
        </TableHead>
        <TableHead className="text-center">
          <HeaderWithTip label="CI" tip="CI checks passing rate" />
        </TableHead>
        <TableHead className="text-center">
          <HeaderWithTip label="Depth" tip="Human-agent turn pairs" />
        </TableHead>
        <TableHead className="text-right">
          <HeaderWithTip label="Cost" tip="Token cost in dollars" />
        </TableHead>
        <TableHead className="text-center">
          <HeaderWithTip
            label="Sessions"
            tip="Agent sessions linked to this PR"
          />
        </TableHead>
      </TableRow>
    </TableHeader>
  );
}
