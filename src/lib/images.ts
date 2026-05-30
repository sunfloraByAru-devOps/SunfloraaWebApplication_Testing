import { supabase } from './supabase';

export function getImageUrl(path: string | null | undefined, bucket: string = 'product-images'): string {
  if (!path) return '';
  // If path is already a full URL, return it directly
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
