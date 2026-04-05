"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface TabsContextValue {
  value: string | null;
  onValueChange: (value: string | null) => void;
}

const TabsContext = React.createContext<TabsContextValue>({
  value: null,
  onValueChange: () => {},
});

function Tabs({
  value,
  onValueChange,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  value: string | null;
  onValueChange: (value: string | null) => void;
}) {
  return (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <div
        data-slot="tabs"
        className={cn("flex flex-col gap-3", className)}
        {...props}
      />
    </TabsContext.Provider>
  );
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="tabs-list"
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}

function TabsTrigger({
  value: triggerValue,
  className,
  ...props
}: React.ComponentProps<"button"> & { value: string }) {
  const { value: currentValue, onValueChange } =
    React.useContext(TabsContext);
  const isActive = currentValue === triggerValue;
  return (
    <button
      type="button"
      role="tab"
      data-state={isActive ? "active" : "inactive"}
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
        className
      )}
      onClick={() => onValueChange(triggerValue)}
      {...props}
    />
  );
}

function TabsContent({
  value: panelValue,
  className,
  ...props
}: React.ComponentProps<"div"> & { value: string }) {
  const { value: currentValue } = React.useContext(TabsContext);
  if (currentValue !== panelValue) return null;
  return (
    <div
      role="tabpanel"
      data-slot="tabs-content"
      className={cn(
        "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className
      )}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
