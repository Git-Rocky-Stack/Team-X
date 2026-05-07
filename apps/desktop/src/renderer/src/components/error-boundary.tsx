import { AlertTriangle } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';

import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  componentName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Error Boundary - catches React component errors and displays debugging info
 *
 * Wrap individual components to identify which specific component is failing.
 * The componentName prop helps identify which component threw the error.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Error Boundary caught an error:', error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      // Custom fallback UI can be provided via props
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI with debugging info
      return (
        <div className="flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl border-destructive/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                Component Error
              </CardTitle>
              <CardDescription>
                {this.props.componentName
                  ? `The "${this.props.componentName}" component failed to render.`
                  : 'A component failed to render.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <h4 className="text-h4">Error Message:</h4>
                <pre className="rounded-md bg-destructive/10 p-3 text-code-sm text-destructive overflow-auto max-h-32">
                  {this.state.error?.toString()}
                </pre>
              </div>

              {this.state.errorInfo && (
                <div className="space-y-2">
                  <h4 className="text-h4">Component Stack:</h4>
                  <pre className="rounded-md bg-muted p-3 text-code-sm overflow-auto max-h-48">
                    {this.state.errorInfo.componentStack}
                  </pre>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                  Reload Application
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    this.setState({ hasError: false, error: null, errorInfo: null });
                  }}
                >
                  Try Again
                </Button>
              </div>

              <div className="text-caption text-muted-foreground">
                <strong>Debug info:</strong> Check the browser console (F12 → Console) for more
                details. Open an issue with the error message and component stack above.
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
