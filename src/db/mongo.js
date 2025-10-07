import mongoose from "mongoose";

export async function connectMongo() {
  const uri =
    "mongodb+srv://hemanthhemu3399:hemanthhemu3399@cluster0.53r8xqg.mongodb.net/?retryWrites=true&w=majority";
  if (!uri) throw new Error("MONGO_URI missing");
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri, { dbName: "auto_pick" });
  console.log("[mongo] connected");
}
