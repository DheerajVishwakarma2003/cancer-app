/* pricing.js — OnchoLens Razorpay Subscription Flow */
(function () {
  let isAnnual = false;

  /* ── Billing toggle ───────────────────────────────── */
  window.toggleBilling = function () {
    isAnnual = !isAnnual;
    const wrap = document.querySelector(".toggle-wrap");
    wrap.classList.toggle("active", isAnnual);

    document.querySelectorAll(".price-amount").forEach((el) => {
      const monthly = parseInt(el.dataset.monthly, 10);
      const annual  = parseInt(el.dataset.annual,  10);
      const val     = isAnnual ? annual : monthly;
      el.textContent = "₹" + val.toLocaleString("en-IN");
    });
  };

  /* ── FAQ accordion ────────────────────────────────── */
  window.toggleFaq = function (btn) {
    const answer = btn.nextElementSibling;
    const open   = btn.classList.contains("open");
    // close all
    document.querySelectorAll(".faq-q.open").forEach((b) => {
      b.classList.remove("open");
      b.nextElementSibling.classList.remove("open");
    });
    if (!open) {
      btn.classList.add("open");
      answer.classList.add("open");
    }
  };

  /* ── Subscribe flow ───────────────────────────────── */
  window.subscribe = async function (planId) {
    if (!Auth.isLoggedIn()) {
      toast.info("Please log in to subscribe.");
      setTimeout(() => (window.location.href = "/login"), 1200);
      return;
    }

    try {
      // 1. Create Razorpay order via backend
      const res = await Auth.apiFetch("/api/subscription/create", {
        method: "POST",
        body: JSON.stringify({ plan_id: planId }),
      });
      if (!res) return;
      const order = await res.json();
      if (!res.ok) { toast.error(order.error || "Could not create order"); return; }

      // 2. Open Razorpay checkout
      const options = {
        key:         order.key_id,
        amount:      order.amount,
        currency:    order.currency,
        name:        "OnchoLens",
        description: order.plan_name,
        order_id:    order.order_id,
        theme:       { color: "#0ea5e9" },
        handler: async function (response) {
          // 3. Verify payment on backend
          const verifyRes = await Auth.apiFetch("/api/subscription/verify", {
            method: "POST",
            body: JSON.stringify({
              razorpay_order_id:   response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature:  response.razorpay_signature,
              plan_id:             planId,
            }),
          });
          const verifyData = await verifyRes.json();
          if (verifyRes.ok) {
            toast.success("🎉 Subscription activated!");
            setTimeout(() => {
              const role = Auth.getRole();
              window.location.href = role === "doctor"
                ? "/doctor/dashboard"
                : "/patient/dashboard";
            }, 1500);
          } else {
            toast.error(verifyData.error || "Payment verification failed");
          }
        },
        modal: {
          ondismiss: () => toast.info("Payment cancelled"),
        },
      };

      // If mock mode (no real Razorpay key), simulate
      if (order.key_id === "rzp_test_mock") {
        toast.info("🛠 Development mode — simulating payment success");
        const mockRes = await Auth.apiFetch("/api/subscription/verify", {
          method: "POST",
          body: JSON.stringify({
            razorpay_order_id:   order.order_id,
            razorpay_payment_id: "pay_mock_" + Date.now(),
            razorpay_signature:  "mock_signature",
            plan_id:             planId,
          }),
        });
        if (mockRes?.ok) {
          toast.success("✅ Subscription activated (mock)!");
        }
        return;
      }

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err) {
      console.error(err);
      toast.error("Subscription failed. Please try again.");
    }
  };
})();
