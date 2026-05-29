import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import IntakeForm from "./pages/IntakeForm";
import BriefResult from "./pages/BriefResult";
import History from "./pages/History";
import SignInPage from "./pages/SignInPage";
import SignUpPage from "./pages/SignUpPage";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/create"} component={IntakeForm} />
      <Route path={"/brief/:id"} component={BriefResult} />
      <Route path={"/history"} component={History} />
      <Route path={"/sign-in"} component={SignInPage} />
      <Route path={"/sign-up"} component={SignUpPage} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
