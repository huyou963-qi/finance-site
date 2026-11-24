import { researchIssuer, researchResource, researchScopes } from "@/lib/researchMcp/oauth";

export const dynamic = "force-dynamic";
export function GET() {
  return Response.json({
    resource: researchResource(), authorization_servers: [researchIssuer()],
    scopes_supported: researchScopes, bearer_methods_supported: ["header"],
  });
}
