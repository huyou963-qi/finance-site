import { researchIssuer, researchScopes } from "@/lib/researchMcp/oauth";

export const dynamic = "force-dynamic";
export function GET() {
  const issuer = researchIssuer();
  return Response.json({
    issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`,
    revocation_endpoint: `${issuer}/revoke`, scopes_supported: researchScopes,
    response_types_supported: ["code"], grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"], code_challenge_methods_supported: ["S256"],
    authorization_response_iss_parameter_supported: true,
  });
}
