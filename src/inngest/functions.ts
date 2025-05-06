import { s3Client } from "@/lib/s3";
import { inngest } from "./client";

export const helloWorld = inngest.createFunction(
  { id: "test-agent-call", concurrency: 5 },
  { event: "agent.call" },
  async ({ step }) => {
    await step.ai.infer("do-agent-call", {
      model: step.ai.models.openai({
        model: "gpt-4o",
        baseUrl: process.env.DO_AGENT_ENDPOINT_URL,
        apiKey: process.env.DO_AGENT_API_KEY,
      }),
      body: {
        messages: [
          {
            role: "user",
            content:
              "What is the overall customer satisfaction in the past month?",
          },
        ],
      },
    });
  }
);

export const addNewOrdersToKnowledgeBase = inngest.createFunction(
  {
    id: "add-new-orders-to-knowledge-base",
    batchEvents: {
      timeout: "60s",
      maxSize: 100,
    },
  },
  { event: "reviews.created" },
  async ({ step, events }) => {
    await step.run("store-reviews-in-space-bucket", async () => {
      const items = events.map((event) => {
        return {
          createdAt: event.data.createdAt,
          content: event.data.content,
          score: event.data.score,
        };
      });

      await s3Client.putObject({
        Bucket: process.env.DO_SPACE_BUCKET_NAME!,
        Key: `reviews-${Date.now()}.json`,
        Body: JSON.stringify(items),
      });
    });

    await step.run("re-index-knowledge-base", async () => {
      return await fetch(
        "https://api.digitalocean.com/v2/gen-ai/indexing_jobs",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.DO_PERSONAL_ACCESS_TOKEN}`,
          },
          body: JSON.stringify({
            // datasource_id: process.env.DO_GENAI_DATASOURCE_ID!,
            knowledge_base_uuid: process.env.DO_GENAI_KNOWLEDGE_BASE_ID!,
          }),
        }
      );
    });
  }
);

export const generateReviews = inngest.createFunction(
  { id: "generate-reviews" },
  { event: "reviews.generate" },
  async ({ step }) => {
    const reviewsResponse = await step.ai.infer("generate-reviews", {
      model: step.ai.models.openai({
        model: "gpt-4o",
        apiKey: process.env.OPENAI_API_KEY,
      }),
      body: {
        messages: [
          {
            role: "user",
            content: `Generate 10 reviews for a restaurant using the following format:
            
            <json>
            [
              {
                "createdAt": "2021-01-01",
                "content": "This is a review",
                "score": 5
              },
              {
                "createdAt": "2021-01-02",
                "content": "This is another review",
                "score": 10
              }
            ]
            </json>
            `,
          },
        ],
      },
    });

    const reviews = reviewsResponse.choices[0].message.content || "";

    const parsedReviews = JSON.parse(
      reviews.replaceAll(`\n`, " ").match(/```json([\s\S]*?)```/)?.[1] || "[]"
    );

    for (const review of parsedReviews) {
      await step.sendEvent("create-review", {
        name: "reviews.created",
        data: review,
      });
    }
  }
);
