import { NextResponse } from 'next/server';
import { ZendeskClient } from '../../../services/zendeskClient';

function getZendeskClient(): ZendeskClient {
  const subdomain = process.env.ZENDESK_SUBDOMAIN;
  const email = process.env.ZENDESK_EMAIL;
  const apiToken = process.env.ZENDESK_API_TOKEN;
  if (!subdomain || !email || !apiToken) {
    throw new Error('Missing Zendesk configuration (ZENDESK_SUBDOMAIN, ZENDESK_EMAIL, ZENDESK_API_TOKEN)');
  }
  return new ZendeskClient({ subdomain, email, apiToken });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const ticketIdParam = searchParams.get('ticketId');
    const ticketId = ticketIdParam ? Number(ticketIdParam) : NaN;

    if (!Number.isFinite(ticketId) || ticketId < 1) {
      return NextResponse.json({ error: 'Valid ticketId query parameter is required' }, { status: 400 });
    }

    const client = getZendeskClient();
    const comments = await client.getTicketComments(ticketId);

    return NextResponse.json({
      ticketId,
      comments,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch ticket comments';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
