import React, { useEffect } from "react";
import { useLocation, Link } from "react-router-dom";
import { Home, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const NotFound: React.FC = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404: User attempted to access non-existent route:",
      location.pathname,
    );
  }, [location.pathname]);

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <Card className="glass-card border-border/40 max-w-md w-full animate-slide-up text-center border-none shadow-none bg-transparent sm:bg-card/50 sm:border-solid">
        <CardContent className="pt-10 pb-10">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 bg-destructive/10 border border-destructive/20">
            <AlertTriangle size={28} className="text-destructive" />
          </div>
          <h1 className="text-6xl font-extrabold mb-2 bg-gradient-to-br from-primary to-indigo-400 bg-clip-text text-transparent">
            404
          </h1>
          <p className="text-xl text-foreground font-semibold mb-2">
            Page not found
          </p>
          <p className="text-sm text-muted-foreground mb-8 max-w-[250px] mx-auto">
            The page you're looking for doesn't exist or has been moved.
          </p>
          <Button asChild className="gap-2">
            <Link to="/">
              <Home size={16} /> Return to Home
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
