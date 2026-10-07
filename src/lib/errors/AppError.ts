/** Error de la aplicación cuyo mensaje está pensado para mostrarse directamente al usuario. */
export class AppError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AppError'
  }
}
