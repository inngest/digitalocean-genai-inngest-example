import { serve } from "inngest/next";
import { inngest } from "../../../inngest/client";
import {
  addNewOrdersToKnowledgeBase,
  generateReviews,
  helloWorld,
} from "../../../inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [helloWorld, generateReviews, addNewOrdersToKnowledgeBase],
});
