<?php

namespace Everforest;

final class ThemePreference
{
    public function __construct(
        public readonly string $mode,
        public readonly float $contrast,
    ) {}

    public function readableContrast(): float
    {
        return max($this->contrast, 4.5);
    }
}
