import {Pool} from 'pg'
export function getDb(url){return new Pool({connectionString:url})}
