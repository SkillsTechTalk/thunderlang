import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import knexFactory from 'knex';

export const prisma = new PrismaClient();
export const pool = new Pool();
export const db = drizzle(pool);
export const knex = knexFactory({ client: 'pg' });
