import { getServiceClient } from '../_shared/supabase.ts';
import { handleTokenizeReading } from './handler.ts';

Deno.serve((request) => handleTokenizeReading(request, getServiceClient()));
