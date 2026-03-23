import mongoose from "mongoose";


const airlineSchema = new mongoose.Schema({
    airLineCode: String,
    airLineName: String,
    airlineNameAr: String
});

export default mongoose.model('Airline', airlineSchema);

