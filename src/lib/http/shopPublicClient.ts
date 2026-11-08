import axios from 'axios'
import { env } from '../../config/env'

/**
 * HTTP for public shop reads. Does not attach the ADMIN token, so a panel session cannot
 * log itself out when the visitor browses the storefront.
 */
export const shopPublicClient = axios.create({
  baseURL: env.apiUrl,
  headers: { 'Content-Type': 'application/json' },
})
