//go:build !windows

package main

func runDesktop(c Config) (bool, error) { return false, nil }
