import { useMemo, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GenerateTab } from "@/components/generate-tab";
import { DecomposeTab } from "@/components/decompose-tab";
import { DelimiterExportTab } from "@/components/delimiter-export-tab";
import { StripTab } from "@/components/strip-tab";
import { MqParseTab } from "@/components/mq-parse-tab";
import { parseCopybook } from "@/lib/cobol";
import { useToast } from "@/hooks/use-toast";
import { useSettings } from "@/lib/settings-api";
import {
  ADMIN_USER,
  LoginScreen,
  UserManagerDialog,
  getSessionUser,
  logout,
} from "@/components/auth";
import { BroadcastBanner, BroadcastDialog } from "@/components/broadcast";
import { version } from "../package.json";

const queryClient = new QueryClient();

function AppInner() {
  const [user, setUser] = useState<string | null>(getSessionUser);
  const { data: settings } = useSettings();
  const broadcast = settings?.broadcast ?? null;
  const [activeTab, setActiveTab] = useState("generate");
  const [generateCopybook, setGenerateCopybook] = useState("");
  const [generateValues, setGenerateValues] = useState<Record<string, string>>({});
  const [decomposeCopybook, setDecomposeCopybook] = useState("");
  const [decomposeStream, setDecomposeStream] = useState("");
  const [delimCopybook, setDelimCopybook] = useState("");
  // Raw bytes: Delimiter Export decodes them as text or binary COMP-3 depending on the copybook.
  const [delimData, setDelimData] = useState<Uint8Array | null>(null);
  const { toast } = useToast();

  const generateFields = useMemo(() => {
    try {
      return parseCopybook(generateCopybook);
    } catch (e) {
      return [];
    }
  }, [generateCopybook]);

  const handleSendToGenerate = (fieldName: string, value: string) => {
    const match = generateFields.find((f) => f.name === fieldName && !f.isGroup);
    if (!match) {
      toast({
        title: "No matching field",
        description: `"${fieldName}" wasn't found in the Generate tab's copybook.`,
        variant: "destructive",
      });
      return;
    }
    setGenerateValues((prev) => ({ ...prev, [match.id]: value }));
    setActiveTab("generate");
    toast({ title: "Sent to Generate", description: `${fieldName} value copied over.` });
  };

  const handleContinueInGenerate = (copybookText: string, valuesByName: Record<string, string>) => {
    setGenerateCopybook(copybookText);
    let freshFields = generateFields;
    try {
      freshFields = parseCopybook(copybookText);
    } catch (e) {
      freshFields = [];
    }
    const newValues: Record<string, string> = {};
    for (const f of freshFields) {
      if (f.isGroup) continue;
      if (Object.prototype.hasOwnProperty.call(valuesByName, f.name)) {
        newValues[f.id] = valuesByName[f.name];
      }
    }
    setGenerateValues(newValues);
    setActiveTab("generate");
    toast({ title: "Continuing in Generate", description: "The copybook and field values were carried over." });
  };

  if (!user) {
    return <LoginScreen onLogin={setUser} />;
  }

  return (
    <div className="min-h-[100dvh] w-full flex flex-col bg-background text-foreground font-sans">
            <header className="border-b bg-card">
              <div className="container mx-auto px-4 h-14 flex items-center justify-between max-w-6xl">
                <div className="flex items-center gap-3">
                  <img src="/favicon.svg" alt="DDM Stream for COBOLers" className="w-7 h-7" />
                  <h1 className="font-semibold tracking-tight text-sm">DDM Stream for COBOLers</h1>
                </div>
                <div className="flex items-center gap-2">
                  {user === ADMIN_USER && <BroadcastDialog />}
                  {user === ADMIN_USER && <UserManagerDialog />}
                  <span className="text-sm text-muted-foreground">{user}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      logout();
                      setUser(null);
                    }}
                  >
                    Logout
                  </Button>
                  <ThemeToggle />
                </div>
              </div>
            </header>
            <main className="flex-1 container mx-auto px-4 py-8 max-w-6xl">
              {broadcast && (
                <div className="mb-6">
                  <BroadcastBanner broadcast={broadcast} />
                </div>
              )}
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-5 max-w-[840px] mb-8">
                  <TabsTrigger value="generate">Generate</TabsTrigger>
                  <TabsTrigger value="decompose">Decompose</TabsTrigger>
                  <TabsTrigger value="delimiter-export">Delimiter Export</TabsTrigger>
                  <TabsTrigger value="strip">Strip</TabsTrigger>
                  <TabsTrigger value="mq-parse">Parse Message</TabsTrigger>
                </TabsList>
                <TabsContent value="generate" className="focus-visible:outline-none">
                  <GenerateTab
                    copybookSource={generateCopybook}
                    setCopybookSource={setGenerateCopybook}
                    values={generateValues}
                    setValues={setGenerateValues}
                  />
                </TabsContent>
                <TabsContent value="decompose" className="focus-visible:outline-none">
                  <DecomposeTab
                    copybookSource={decomposeCopybook}
                    setCopybookSource={setDecomposeCopybook}
                    streamSource={decomposeStream}
                    setStreamSource={setDecomposeStream}
                    onSendToGenerate={handleSendToGenerate}
                    onContinueInGenerate={handleContinueInGenerate}
                  />
                </TabsContent>
                <TabsContent value="delimiter-export" className="focus-visible:outline-none">
                  <DelimiterExportTab
                    copybookSource={delimCopybook}
                    setCopybookSource={setDelimCopybook}
                    dataSource={delimData}
                    setDataSource={setDelimData}
                  />
                </TabsContent>
                {/* forceMount keeps Strip's state (source, options) alive across tab switches */}
                <TabsContent value="strip" forceMount className="focus-visible:outline-none data-[state=inactive]:hidden">
                  <StripTab />
                </TabsContent>
                {/* forceMount keeps MQ Parse's state alive across tab switches */}
                <TabsContent value="mq-parse" forceMount className="focus-visible:outline-none data-[state=inactive]:hidden">
                  <MqParseTab />
                </TabsContent>
              </Tabs>
            </main>
            <footer className="border-t">
              <div className="container mx-auto px-4 py-3 max-w-6xl text-xs text-muted-foreground">
                DDM Stream for COBOLers v{version}
              </div>
            </footer>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <AppInner />
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
