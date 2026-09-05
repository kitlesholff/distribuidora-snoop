(() => {
  "use strict";

  const carousel = document.getElementById("heroCarousel");
  if (!carousel) return;

  const track = carousel.querySelector(".hero-carousel-track");
  const slides = Array.from(carousel.querySelectorAll(".hero-slide"));
  const dotsHost = carousel.querySelector(".hero-carousel-dots");
  const previousButton = carousel.querySelector("[data-carousel-prev]");
  const nextButton = carousel.querySelector("[data-carousel-next]");
  const progressBar = carousel.querySelector(".hero-carousel-progress span");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const changeDelay = 4800;
  const pauseReasons = new Set();

  let currentSlide = 0;
  let autoplayTimer = 0;
  let pointerStartX = null;

  if (!track || slides.length < 2 || !dotsHost) return;

  const dots = slides.map((slide, index) => {
    const dot = document.createElement("button");
    dot.className = "hero-carousel-dot";
    dot.type = "button";
    dot.setAttribute("aria-label", `Mostrar destaque ${index + 1} de ${slides.length}`);
    dot.addEventListener("click", () => showSlide(index));
    dotsHost.appendChild(dot);
    return dot;
  });

  function stopAutoplay() {
    window.clearTimeout(autoplayTimer);
    autoplayTimer = 0;
    progressBar?.classList.remove("running");
  }

  function startAutoplay() {
    stopAutoplay();
    if (reducedMotion.matches || document.hidden || pauseReasons.size) return;

    if (progressBar) {
      void progressBar.offsetWidth;
      progressBar.classList.add("running");
    }

    autoplayTimer = window.setTimeout(() => {
      showSlide(currentSlide + 1);
    }, changeDelay);
  }

  function showSlide(nextIndex, restart = true) {
    currentSlide = (nextIndex + slides.length) % slides.length;
    track.style.transform = `translate3d(-${currentSlide * 100}%, 0, 0)`;

    slides.forEach((slide, index) => {
      slide.setAttribute("aria-hidden", index === currentSlide ? "false" : "true");
    });

    dots.forEach((dot, index) => {
      const active = index === currentSlide;
      dot.classList.toggle("active", active);
      dot.setAttribute("aria-current", active ? "true" : "false");
    });

    if (restart) startAutoplay();
  }

  function pause(reason) {
    pauseReasons.add(reason);
    stopAutoplay();
  }

  function resume(reason) {
    pauseReasons.delete(reason);
    startAutoplay();
  }

  previousButton?.addEventListener("click", () => showSlide(currentSlide - 1));
  nextButton?.addEventListener("click", () => showSlide(currentSlide + 1));

  carousel.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      showSlide(currentSlide - 1);
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      showSlide(currentSlide + 1);
    }
  });

  carousel.addEventListener("mouseenter", () => pause("hover"));
  carousel.addEventListener("mouseleave", () => resume("hover"));

  carousel.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) return;
    pointerStartX = event.clientX;
    pause("gesture");
  });

  carousel.addEventListener("pointerup", (event) => {
    if (pointerStartX === null) return;
    const movement = event.clientX - pointerStartX;
    pointerStartX = null;

    if (Math.abs(movement) >= 45) {
      showSlide(currentSlide + (movement < 0 ? 1 : -1), false);
    }

    resume("gesture");
  });

  carousel.addEventListener("pointercancel", () => {
    pointerStartX = null;
    resume("gesture");
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pause("hidden");
    else resume("hidden");
  });

  reducedMotion.addEventListener?.("change", startAutoplay);
  showSlide(0);
})();
