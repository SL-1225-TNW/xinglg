// Repository variables are public. Do not use database/admin credentials.
import fs from 'node:fs';
import vm from 'node:vm';
const url = process.env.MOSS_SUPABASE_URL || '';
const publishableKey = process.env.MOSS_SUPABASE_PUBLISHABLE_KEY || '';
if (Boolean(url) !== Boolean(publishableKey)) throw new Error('Both public cloud variables must be provided together');
const scope={window:{},URL,atob};
vm.runInNewContext(fs.readFileSync(new URL('../cloud-auth.js',import.meta.url),'utf8'),scope);
const config=scope.window.MossCloud.checkedConfig({url,publishableKey});
const output=new URL('../cloud-config.js',import.meta.url);
fs.writeFileSync(output,'/* Generated public configuration. */\nwindow.MOSS_CLOUD_CONFIG = '+JSON.stringify(config||{url:'',publishableKey:''})+';\n');
console.log(config?'Public cloud configuration generated.':'No public cloud configuration: guest mode remains enabled.');
