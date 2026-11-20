import {defineConfig} from '@playwright/test';
const state=process.env.SYUCAI_E2E_STATE||'.wrangler/test-state-'+process.pid;
process.env.SYUCAI_E2E_STATE=state;
export default defineConfig({testDir:'./tests/browser',fullyParallel:false,workers:1,use:{baseURL:'http://127.0.0.1:8787',launchOptions:{executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']},screenshot:'only-on-failure'},webServer:{command:`npx wrangler d1 migrations apply syucai --local --persist-to ${state} && npx wrangler dev --ip 127.0.0.1 --port 8787 --persist-to ${state} --var ADMIN_TOKEN:local-test-admin --var RESEND_API_KEY:`,url:'http://127.0.0.1:8787',reuseExistingServer:false,timeout:60000}});
