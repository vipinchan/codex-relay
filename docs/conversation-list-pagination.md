# Conversation list pagination

The conversation home loads the most recent 20 conversations initially. Swiping
up to the end of the list loads an earlier global page. Time and project grouping
use the same loaded conversations and cursor. Neither grouping adds a per-project
load control.

Search matches loaded conversations. While a search is active, scrolling does not
automatically fetch additional history. Clear the search to continue browsing.

The footer shows older-page progress, a retry action after a failed request, or
the end of history. Background latest-page updates retain loaded older pages.
Pulling down to refresh starts again from the latest page. Archiving a conversation
preserves loaded older pages and prevents in-flight older requests from restoring
the removed conversation.

## API

`GET /v1/threads?limit=20&cursor=...` returns:

```json
{
  "threads": [],
  "source": "app-server",
  "nextCursor": null
}
```

`limit` defaults to 20 and accepts integers from 1 to 100. Omit `cursor` for the
latest page. Pass `nextCursor` unchanged for the next page; null means history is
exhausted. The cursor is opaque and belongs to the selected Relay connection.
Clients deduplicate conversations by ID when activity causes pages to overlap.

The Relay fills pages after filtering subagents and internal conversations.
Failure to obtain an app-server page returns 502 rather than a successful empty
memory response. Invalid pagination input returns 400. Memory-only operation also
supports pagination; refresh if its anchor is no longer available.

The optional response field keeps older clients compatible. A newer mobile client
connected to an older Relay cannot load more pages until that Relay is updated.
The existing indexed-history lookup and empty-index discovery behavior are
preserved; a legacy discovery cursor continues against its original history source.

## Device acceptance

- In both grouping modes, scroll to the end and verify older conversations appear.
- Repeated end events produce one request per gesture; short or collapsed lists
  can still load another page after a deliberate scroll.
- Existing visible conversations remain anchored as earlier pages are added.
- Interrupt the connection, observe the retry footer, reconnect, and retry.
- Switch computers or refresh during a request and verify late results do not
  reappear in the new list.
- Open an older conversation and verify its messages and current selection.

Automated interaction tests do not replace iPhone scroll and layout acceptance.
