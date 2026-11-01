// Minimal in-memory stand-in for Forge's requestJira, enough for the
// endpoints Haulboard calls. Records every call for assertions.

const res = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: String(status),
  json: async () => body,
});

export function mockRequester(issues, { pageSize = 4, failOn = null } = {}) {
  const calls = [];
  const requester = {
    calls,
    async requestJira(route, opts = {}) {
      const path = route.value_ || String(route);
      const method = (opts.method || 'GET').toUpperCase();
      const body = opts.body ? JSON.parse(opts.body) : undefined;
      calls.push({ method, path, body });
      if (failOn && failOn(method, path)) return res(400, { errorMessages: ['simulated failure'] });

      if (method === 'POST' && path === '/rest/api/3/search/jql') {
        const start = body.nextPageToken ? parseInt(body.nextPageToken, 10) : 0;
        const size = Math.min(pageSize, body.maxResults);
        const page = issues.slice(start, start + size);
        const next = start + size < issues.length ? String(start + size) : undefined;
        return res(200, { issues: page, nextPageToken: next, isLast: !next });
      }
      let m = path.match(/^\/rest\/api\/3\/issue\/([A-Z0-9_]+-\d+)\?/);
      if (method === 'GET' && m) {
        const it = issues.find((i) => i.key === m[1]);
        return it ? res(200, it) : res(404, { errorMessages: ['Issue does not exist'] });
      }
      m = path.match(/^\/rest\/api\/3\/issue\/([A-Z0-9_]+-\d+)\/properties\/haulboard_downtime$/);
      if (method === 'PUT' && m) return res(200, {});
      m = path.match(/^\/rest\/api\/3\/issue\/([A-Z0-9_]+-\d+)$/);
      if (method === 'PUT' && m) return res(204, null);
      m = path.match(/^\/rest\/api\/3\/issue\/([A-Z0-9_]+-\d+)\/comment$/);
      if (method === 'POST' && m) return res(201, { id: '1' });
      if (method === 'GET' && path.startsWith('/rest/api/3/project/search')) {
        return res(200, { values: [{ key: 'MINE', name: 'Example Pit North' }] });
      }
      return res(404, { errorMessages: [`no mock for ${method} ${path}`] });
    },
  };
  return requester;
}
