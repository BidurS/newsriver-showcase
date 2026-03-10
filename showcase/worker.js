export default {
    async fetch(request, env) {
        // Worker entry just for asset serving fallback
        return new Response('Not Found', { status: 404 });
    }
};
