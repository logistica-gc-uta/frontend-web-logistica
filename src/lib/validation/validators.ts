const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const isBlank = (value: string): boolean => value.trim().length === 0

export const isValidEmail = (value: string): boolean => EMAIL_PATTERN.test(value.trim())
