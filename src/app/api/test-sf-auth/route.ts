// TEMPORARY DEBUG ENDPOINT — DELETE AFTER TESTING
import { NextResponse } from 'next/server';

export async function GET() {
  const loginUrl = process.env.SF_LOGIN_URL || 'https://login.salesforce.com';
  const clientId = process.env.SF_CLIENT_ID || '';
  const clientSecret = process.env.SF_CLIENT_SECRET || '';
  const username = process.env.SF_USERNAME || '';
  const password = process.env.SF_PASSWORD || '';
  const securityToken = process.env.SF_SECURITY_TOKEN || '';

  const envCheck = {
    SF_LOGIN_URL: loginUrl,
    SF_CLIENT_ID: clientId ? `set (${clientId.length} chars)` : 'MISSING',
    SF_CLIENT_SECRET: clientSecret ? `set (${clientSecret.length} chars)` : 'MISSING',
    SF_USERNAME: username ? `set (${username.length} chars)` : 'MISSING',
    SF_PASSWORD: password ? `set (${password.length} chars)` : 'MISSING',
    SF_SECURITY_TOKEN: securityToken ? `set (${securityToken.length} chars)` : 'empty/missing',
    combined_password_length: (password + securityToken).length,
  };

  try {
    const params = new URLSearchParams({
      grant_type: 'password',
      client_id: clientId,
      client_secret: clientSecret,
      username: username,
      password: `${password}${securityToken}`,
    });

    const res = await fetch(`${loginUrl}/services/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const bodyText = await res.text();
    let bodyJson: any = null;
    try { bodyJson = JSON.parse(bodyText); } catch { /* not JSON */ }

    if (res.ok && bodyJson) {
      return NextResponse.json({
        success: true,
        envCheck,
        sf_status: res.status,
        instance_url: bodyJson.instance_url,
        token_type: bodyJson.token_type,
        issued_at: bodyJson.issued_at,
        // NOT returning access_token
      });
    }

    return NextResponse.json({
      success: false,
      envCheck,
      sf_status: res.status,
      sf_response: bodyJson || bodyText,
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      envCheck,
      error: err.message,
    });
  }
}
