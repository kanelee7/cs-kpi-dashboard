import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL_2!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_2!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Database types
export interface Ticket {
  id: number
  created_at: string
  resolved_at: string | null
  status: string
  first_response_time: number | null
  first_contact_resolved: boolean
}

export interface CSATFeedback {
  id: number
  ticket_id: number
  rating: number
  comment: string | null
  created_at: string
}