import { Plus } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";

type CreateActionButtonProps = Omit<ButtonProps, "variant">;

export function CreateActionButton({ children, ...props }: CreateActionButtonProps) {
  return (
    <Button variant="create" {...props}>
      <Plus aria-hidden />
      {children}
    </Button>
  );
}
