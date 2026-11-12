/** Error con código HTTP y un código corto que la app sabe traducir. */
export class HttpError extends Error {
  constructor(status, code, message = code, details = {}) { super(message); this.status = status; this.code = code; this.details = details; }
}
/** La tienda dijo que la compra no vale (o no es de esta cuenta). */
export class InvalidPurchaseError extends HttpError {
  constructor(reason) { super(422, 'compra_invalida', reason); }
}
/** No se pudo hablar con la tienda: la app debe reintentar más tarde (la compra sigue pendiente, no se pierde). */
export class StoreUnavailableError extends HttpError {
  constructor(detail) { super(503, 'tienda_no_disponible', detail); }
}
