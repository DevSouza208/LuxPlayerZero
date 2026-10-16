/** Somente informa se a integração privada está configurada. Não expõe chaves. */
export const onRequestGet = ({ env }) => new Response(JSON.stringify({
  configured: typeof env?.TMDB_API_KEY === 'string' && env.TMDB_API_KEY.trim().length > 0 &&
    typeof env?.DB?.prepare === 'function'
}), {
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  }
});
