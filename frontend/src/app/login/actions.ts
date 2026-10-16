'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

const back = (key: 'error' | 'message', text: string) => redirect(`/login?${key}=${encodeURIComponent(text)}`)

function credentials(formData: FormData) {
  return {
    email: String(formData.get('email') ?? '').trim(),
    password: String(formData.get('password') ?? ''),
  }
}

export async function login(formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(credentials(formData))

  if (error) {
    // Supabase's own message, e.g. "Invalid login credentials" or "Email not confirmed"
    back('error', error.message)
  }

  revalidatePath('/', 'layout')
  redirect('/')
}

export async function signup(formData: FormData) {
  const supabase = await createClient()
  const data = credentials(formData)
  const { data: result, error } = await supabase.auth.signUp(data)

  if (error) {
    back('error', error.message)
  }

  // With email confirmation on (this project's setting) there is no session until the link is clicked
  if (!result.session) {
    back('message', `Account created. We sent a confirmation link to ${data.email}. Click it, then sign in here.`)
  }

  revalidatePath('/', 'layout')
  redirect('/')
}
