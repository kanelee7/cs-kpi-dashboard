import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function deleteDefault() {
    const supabase = createClient(supabaseUrl, supabaseKey);
    console.log('Deleting records with brand="default"...');
    const { data, error, count } = await supabase
        .from('kpis')
        .delete({ count: 'exact' })
        .eq('brand', 'default');

    if (error) {
        console.error('Error deleting:', error);
    } else {
        console.log(`Deleted ${count} records with brand="default".`);
    }
}

deleteDefault();
