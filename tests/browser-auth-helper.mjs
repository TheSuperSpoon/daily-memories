import { createServer } from 'node:http';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const redirectTo = process.env.QA_REDIRECT_TO ?? 'http://127.0.0.1:8787/index.html';
const role = process.env.QA_ROLE ?? 'ray';
const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

const server = createServer(async (request, response) => {
  if (request.url !== '/login') { response.writeHead(404).end('Not found'); return; }
  try {
    const { data: member, error: memberError } = await admin.from('space_members').select('user_id')
      .eq('space_id', '00000000-0000-0000-0000-000000000001').eq('role', role).single();
    if (memberError) throw memberError;
    const { data: userData, error: userError } = await admin.auth.admin.getUserById(member.user_id);
    if (userError) throw userError;
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'magiclink', email: userData.user.email, options: { redirectTo }
    });
    if (error) throw error;
    response.writeHead(302, { Location: data.properties.action_link, 'Cache-Control': 'no-store' }).end();
  } catch (error) {
    response.writeHead(500, { 'Content-Type': 'text/plain' }).end(error.message);
  }
});

server.listen(8790, '127.0.0.1');

