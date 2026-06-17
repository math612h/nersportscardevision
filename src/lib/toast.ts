import { toast } from "sonner";

export function toastError(message: string) {
  return toast.error(message, {
    description: "Tag et screenshot af denne meddelelse og opret en ticket på LMU Danmark Discord",
  });
}
