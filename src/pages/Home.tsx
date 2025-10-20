import { Button } from "@/components/ui/button";
import { ArrowRight, MessageCircle, Users, Clock, Zap } from "lucide-react";
import { useEffect, useRef } from "react";
import { Api } from "../api";
import { THREAD_ID, BOT_ID, USER_A_ID, USER_B_ID } from "../config";

export default function Home() {
  const heroRef = useRef<HTMLDivElement>(null);
  const featuresRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observerOptions = {
      threshold: 0.1,
      rootMargin: "0px 0px -100px 0px",
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("animate-fade-in-up");
        }
      });
    }, observerOptions);

    const elements = document.querySelectorAll(".fade-in-trigger");
    elements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-background/80 backdrop-blur-md z-50 border-b border-border">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full border-2 border-primary flex items-center justify-center">
              <span className="text-xs font-bold text-primary">loop</span>
            </div>
            <span className="font-semibold text-lg text-foreground">loop</span>
          </div>
          <div className="flex items-center gap-6">
            <a
              href="#features"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Features
            </a>
            <a
              href="#about"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              About
            </a>
            <a href="/demo">
              <Button className="bg-primary hover:bg-primary/90 text-white rounded-lg px-6">
                Demo here
              </Button>
            </a>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section
        ref={heroRef}
        className="pt-32 pb-20 px-4 md:px-8 bg-gradient-to-br from-background via-background to-blue-950/20"
      >
        <div className="container max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            {/* Left content */}
            <div className="animate-slide-in-left">
              <h1 className="text-5xl md:text-6xl font-bold leading-tight text-foreground mb-6">
                Connected,{" "}
                <span className="text-primary">on your terms</span>
              </h1>
              <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
                Communication without the clutter. Loop uses AI to help your groups communicate passively and asynchronously—you choose when to engage.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button className="bg-primary hover:bg-primary/90 text-white rounded-lg px-8 h-12 text-base flex items-center gap-2">
                  Get Started <ArrowRight size={18} />
                </Button>
                <Button
                  variant="outline"
                  className="border-border hover:bg-card rounded-lg px-8 h-12 text-base"
                >
                  Learn More
                </Button>
              </div>
            </div>

            {/* Right visual */}
            <div className="animate-slide-in-right flex justify-center">
              <div className="relative w-64 h-64 md:w-80 md:h-80">
                {/* Animated circle */}
                <div className="absolute inset-0 rounded-full border-4 border-primary/20 animate-pulse"></div>
                <div className="absolute inset-8 rounded-full border-2 border-primary/40"></div>
                <div className="absolute inset-16 rounded-full border-2 border-primary flex items-center justify-center">
                  <div className="text-center">
                    <MessageCircle className="w-12 h-12 text-primary mx-auto mb-2" />
                    <p className="text-sm font-semibold text-foreground">
                      Async First
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section
        id="features"
        ref={featuresRef}
        className="py-20 px-4 md:px-8 bg-background"
      >
        <div className="container max-w-6xl mx-auto">
          <div className="text-center mb-16 fade-in-trigger">
            <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
              Why Loop?
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Designed for groups that value their time and sanity
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Feature 1 */}
            <div className="fade-in-trigger p-8 rounded-2xl bg-card border border-border hover:border-primary/50 transition-all duration-300">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <Clock className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-3">
                Asynchronous by Design
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                No more urgent notifications. Engage with your group on your own schedule, not theirs.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="fade-in-trigger p-8 rounded-2xl bg-card border border-border hover:border-primary/50 transition-all duration-300">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <Zap className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-3">
                AI-Powered Organization
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                Smart threading and context management keeps conversations clean and easy to follow.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="fade-in-trigger p-8 rounded-2xl bg-card border border-border hover:border-primary/50 transition-all duration-300">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <Users className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-3">
                Group Coordinator
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                Loop acts as your neighborhood mom—sharing stories and keeping everyone in the loop.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="fade-in-trigger p-8 rounded-2xl bg-card border border-border hover:border-primary/50 transition-all duration-300">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <MessageCircle className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-3">
                Cleaned Tone & Context
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                Messages are organized with proper context, making it easy to catch up without confusion.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section id="about" className="py-20 px-4 md:px-8 bg-gradient-to-b from-background to-blue-950/10">
        <div className="container max-w-6xl mx-auto">
          <div className="text-center mb-16 fade-in-trigger">
            <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
              Perfect For
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Whether you're coordinating a family, managing a class, or running a broadcast
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Use Case 1 */}
            <div className="fade-in-trigger">
              <div className="bg-card rounded-2xl p-8 border border-border hover:shadow-lg hover:shadow-primary/10 transition-all duration-300">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4 mx-auto">
                  <Users className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-3 text-center">
                  Family Groups
                </h3>
                <p className="text-muted-foreground text-center">
                  Stay connected with family without the constant ping notifications. Share updates when it matters.
                </p>
              </div>
            </div>

            {/* Use Case 2 */}
            <div className="fade-in-trigger">
              <div className="bg-card rounded-2xl p-8 border border-border hover:shadow-lg hover:shadow-primary/10 transition-all duration-300">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4 mx-auto">
                  <Clock className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-3 text-center">
                  Class Groups
                </h3>
                <p className="text-muted-foreground text-center">
                  Coordinate class activities and share resources without overwhelming your classmates.
                </p>
              </div>
            </div>

            {/* Use Case 3 */}
            <div className="fade-in-trigger">
              <div className="bg-card rounded-2xl p-8 border border-border hover:shadow-lg hover:shadow-primary/10 transition-all duration-300">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4 mx-auto">
                  <Zap className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-3 text-center">
                  Broadcast & Newsletters
                </h3>
                <p className="text-muted-foreground text-center">
                  Share important updates and stories with your community on your schedule.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 md:px-8 bg-background">
        <div className="container max-w-4xl mx-auto text-center fade-in-trigger">
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
            Currently in closed beta
          </h2>
          <p className="text-lg text-muted-foreground mb-4">
            Coming soon for B2C group purchasing, broadcast newsletters, and corporate use.
          </p>
          <p className="text-muted-foreground mb-8">
            Made by fellow poor texters. Reach us at{" "}
            <a
              href="mailto:hello@loopasync.com"
              className="text-primary font-semibold hover:underline"
            >
              hello@loopasync.com
            </a>
          </p>
          <a href="/demo">
            <Button className="bg-primary hover:bg-primary/90 text-white rounded-lg px-8 h-12 text-base">
              Demo here
            </Button>
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-card border-t border-border py-12 px-4 md:px-8">
        <div className="container max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-full border-2 border-primary flex items-center justify-center">
                  <span className="text-xs font-bold text-primary">loop</span>
                </div>
                <span className="font-semibold text-foreground">loop</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Connected on your terms
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4 text-foreground">Product</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <a href="#" className="hover:text-foreground transition-colors">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-foreground transition-colors">
                    Pricing
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4 text-foreground">Company</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <a href="#" className="hover:text-foreground transition-colors">
                    About
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-foreground transition-colors">
                    Blog
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4 text-foreground">Legal</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <a href="#" className="hover:text-foreground transition-colors">
                    Privacy
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-foreground transition-colors">
                    Terms
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-border pt-8">
            <p className="text-center text-sm text-muted-foreground">
              © 2025 Loop. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

