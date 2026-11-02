'use server';

import { revalidatePath } from 'next/cache';
import { createLink } from './lib/api';

// Server Action invoked by the home-page form.
export async function createLinkAction(formData) {
  const url = formData.get('url');
  if (!url) return;
  await createLink(url);
  revalidatePath('/');
}
