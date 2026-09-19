/**
 * Redirect Middleware (desactivado).
 *
 * El sitio ahora sirve las páginas .html originales de forma estática desde
 * public/ (idénticas al sitio previo). Para paridad 1:1 estas rutas deben
 * servirse tal cual — NO se redirigen. Mantenemos un passthrough.
 */
export async function onRequest({ request }: { request: Request }, next: () => Promise<Response>) {
  return next();
}
