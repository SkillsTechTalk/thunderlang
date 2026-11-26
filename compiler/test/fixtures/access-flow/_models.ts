import mongoose from 'mongoose';

const schema = new mongoose.Schema({ owner: String, total: Number });
export const Invoice = mongoose.model('Invoice', schema);
