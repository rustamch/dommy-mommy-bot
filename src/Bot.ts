import { Client, Intents } from "discord.js";
import { Document, MongoClient, Collection } from "mongodb";
import { exit } from "process";

const URI = process.env.MONGODB_URI;

interface ServerMemberRecord {
    id: string;
    lastMessage: Date;
}

const getRecordCollection = async () => {
    if (typeof URI !== "string") {
        console.error("MongoDB URI not set!");
        exit(0);
    }
    const dbClient = await new MongoClient(URI).connect();
    const db = dbClient.db("discord");
    return db.collection("records");
};

const startPruneTimer = async (
    client: Client,
    records: Collection<Document>
) => {
    setInterval(async () => {
        const now = new Date();
        // if the last message was sent more than 40 days ago, prune the user
        const userToPrune = await records
            .find({
                lastMessage: {
                    $lt: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 40)
                }
            })
            .toArray();
        userToPrune.forEach(async (user) => {
            client.guilds.fetch("857619575679877160").then((guild) => {
                const member = guild.members.cache.get(
                    user._id as unknown as string
                );
                member?.send(
                    "Hewwo, you've been pruned from the Doggy Daycare for being too inactive!"
                );
                if (member) {
                    member.kick("Inactive user");
                }
            });
        });
    }, 1000 * 60 * 60 * 24);
};

/**
 * Initializes the bot.
 */
const startBot = async () => {
    const records = await getRecordCollection();
    const client = new Client({ intents: [Intents.FLAGS.GUILDS] });
    client.once("ready", (event) => {
        console.log("Bot is ready!");
        client.guilds.fetch("857619575679877160").then((guild) => {
            guild.members.cache.forEach((member) => {
                if (!member.user.bot) {
                    records.updateOne(
                        { _id: member.id },
                        {
                            $setOnInsert: {
                                _id: member.id,
                                lastMessage: new Date()
                            }
                        },
                        { upsert: true }
                    );
                }
            });
        });
    });
    await client.login(process.env.TOKEN);
    startPruneTimer(client, records);
    client.on("message", async (message) => {
        const userId: string = message.author.id;
        const record = await records.find({ _id: userId }).limit(1).next();
        if (record) {
            await records.updateOne(
                { _id: userId },
                { $set: { lastMessage: new Date() } }
            );
        } else {
            console.log("New user added to db with ID: " + userId);
        }
    });
};
