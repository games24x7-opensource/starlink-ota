import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useState } from "react";
import * as z from "zod";
import { Button } from "components/ui/button";
import { Input } from "components/ui/input";
import { Textarea } from "components/ui/textarea";
import { Switch } from "components/ui/switch";
import { cn } from "lib/utils";
import ReactMarkdown from "react-markdown";
import { Loader2, Pencil, Eye, CheckCircle, XCircle } from "lucide-react";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "components/ui/form";
import type { TRelease, UpdateReleaseResponse } from "lib/types";
import { useToast } from "components/ui/use-toast";

const formSchema = z.object({
  appVersion: z.string().min(1, { message: "Target version is required" }),
  description: z
    .string()
    .max(5000, { message: "Description must be 5000 characters or less" })
    .optional()
    .default(""),
  isDisabled: z.boolean().default(false),
  isMandatory: z.boolean().default(false),
  rolloutPercentage: z.number().min(0).max(100).default(100),
});

interface EditReleaseFormProps {
  release: TRelease;
  onClose: () => void;
  onSave: (
    data: Partial<TRelease>
  ) => Promise<UpdateReleaseResponse | null | undefined>;
}

export function EditReleaseForm({
  release,
  onClose,
  onSave,
}: EditReleaseFormProps) {
  const { toast } = useToast();
  const [isPreview, setIsPreview] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<
    "idle" | "success" | "error"
  >("idle");

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      appVersion: release.appVersion || "",
      description: release.description || "",
      isDisabled: release.isDisabled,
      isMandatory: release.isMandatory,
      rolloutPercentage: 100,
    },
  });

  const handleSubmit = async (data: z.infer<typeof formSchema>) => {
    try {
      setIsSubmitting(true);
      setSubmitStatus("idle");

      const updatedRelease: Partial<TRelease> = {
        ...release,
        appVersion: data.appVersion,
        description: data.description,
        isDisabled: data.isDisabled,
        isMandatory: data.isMandatory,
      };

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error("Request timed out"));
        }, 4000);
      });

      // Wait for the API response
      const response = (await Promise.race([
        onSave(updatedRelease),
        timeoutPromise,
      ])) as UpdateReleaseResponse | null;

      // Handle 204 response (no content)
      if (!response) {
        toast({
          title: "No Changes Detected",
          description: "The form data matches the current release state.",
          variant: "default",
          duration: 2000, // 2 seconds
        });
        onClose();
        return;
      }

      // Handle successful update
      if (response?.package) {
        setSubmitStatus("success");
        toast({
          title: "Success",
          description: "Release has been updated successfully.",
          variant: "default",
          className: "bg-green-50 border-green-200 text-green-800",
          duration: 2000,
        });
        setTimeout(() => {
          onClose();
        }, 1000);
      } else {
        throw new Error("Invalid server response");
      }
    } catch (error) {
      console.error("Error updating release:", error);
      setSubmitStatus("error");
      if (error instanceof Error) {
        if (error.message === "Request timed out") {
          toast({
            title: "Request Timeout",
            description:
              "The request took too long to respond. Please try again.",
            variant: "destructive",
            duration: 2000,
          });
        } else {
          toast({
            title: "Update Failed",
            description: error.message,
            variant: "destructive",
            duration: 2000,
          });
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const getSubmitButton = () => {
    if (isSubmitting) {
      return (
        <Button disabled className="w-full">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Saving...
        </Button>
      );
    }

    if (submitStatus === "success") {
      return (
        <Button className="w-full bg-green-600 hover:bg-green-700">
          <CheckCircle className="mr-2 h-4 w-4" />
          Saved Successfully
        </Button>
      );
    }

    if (submitStatus === "error") {
      return (
        <Button
          className="w-full bg-red-600 hover:bg-red-700"
          onClick={form.handleSubmit(handleSubmit)}
        >
          <XCircle className="mr-2 h-4 w-4" />
          Failed - Try Again
        </Button>
      );
    }

    return (
      <Button type="submit" className="w-full">
        Done
      </Button>
    );
  };

  return (
    <div className="h-screen overflow-y-auto">
      <div className="p-4 sm:p-6">
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-6"
          >
            <FormField
              control={form.control}
              name="appVersion"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Target Versions <span className="text-red-500">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-2">
                    <FormLabel>Description</FormLabel>
                    <div className="flex gap-2 mt-2 sm:mt-0">
                      <Button
                        type="button"
                        size="icon"
                        variant={!isPreview ? "default" : "outline"}
                        onClick={() => setIsPreview(false)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant={isPreview ? "default" : "outline"}
                        onClick={() => setIsPreview(true)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <FormControl>
                    <div className="relative">
                      <Textarea
                        {...field}
                        className={cn(
                          "h-[200px] resize-none overflow-y-auto",
                          isPreview && "absolute inset-0 opacity-0 -z-10"
                        )}
                      />
                      {isPreview && (
                        <div className="h-[200px] overflow-y-auto p-3 border rounded-md prose prose-sm max-w-none">
                          <ReactMarkdown>
                            {field.value || "No description provided"}
                          </ReactMarkdown>
                        </div>
                      )}
                    </div>
                  </FormControl>
                  <FormDescription>
                    Styling with Markdown is supported. 5000 characters or less.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isDisabled"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Enabled</FormLabel>
                    <FormDescription>
                      When disabled, this update will not be available to your
                      users.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={!field.value}
                      onCheckedChange={(checked) => field.onChange(!checked)}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isMandatory"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Required Update</FormLabel>
                    <FormDescription>
                      Force users to update to this release.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="rolloutPercentage"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Rollout Percentage</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      {...field}
                      onChange={(e) => {
                        const newValue = Number(e.target.value);
                        if (newValue >= field.value) {
                          field.onChange(newValue);
                        }
                      }}
                      value={field.value || ""}
                      min={field.value}
                      max={100}
                    />
                  </FormControl>
                  <FormDescription>
                    Set the percentage of users who will receive this update.
                    You can only increase this value.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {getSubmitButton()}
          </form>
        </Form>
      </div>
    </div>
  );
}
